import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { PostsFacade } from './posts.facade';
import { PostsService } from './posts.service';
import { PostResponseDto } from './dto/response/post.response.dto';
import { Post } from './entities/post.entity';
import { CreatePostRequestDto } from './dto/request/create-post.request.dto';

describe('PostsFacade', () => {
  let facade: PostsFacade;
  let mockService: jest.Mocked<PostsService>;

  const now = new Date();

  const mockPost: Post = {
    id: 1,
    title: 'Test Title',
    content: 'Test Content',
    isPublished: false,
    createdAt: now,
    updatedAt: now,
  };

  beforeEach(async () => {
    mockService = {
      findById: jest.fn(),
      findAll: jest.fn(),
      create: jest.fn(),
    } as unknown as jest.Mocked<PostsService>;

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PostsFacade,
        { provide: PostsService, useValue: mockService },
      ],
    }).compile();

    facade = module.get<PostsFacade>(PostsFacade);
  });

  describe('getPostById', () => {
    it('should return a PostResponseDto when post exists', async () => {
      mockService.findById.mockResolvedValue(mockPost);

      const result = await facade.getPostById(1);

      expect(mockService.findById).toHaveBeenCalledWith(1);
      expect(result).toBeInstanceOf(PostResponseDto);
      expect(result.id).toBe(mockPost.id);
      expect(result.title).toBe(mockPost.title);
    });

    it('should throw NotFoundException when post not found', async () => {
      mockService.findById.mockResolvedValue(null);

      await expect(facade.getPostById(999)).rejects.toThrow(NotFoundException);
      expect(mockService.findById).toHaveBeenCalledWith(999);
    });

    it('should include post ID in the error message', async () => {
      mockService.findById.mockResolvedValue(null);

      await expect(facade.getPostById(42)).rejects.toThrow(
        'Post with ID 42 not found',
      );
    });
  });

  describe('getAllPosts', () => {
    it('should return an array of PostResponseDto', async () => {
      mockService.findAll.mockResolvedValue([mockPost]);

      const result = await facade.getAllPosts();

      expect(mockService.findAll).toHaveBeenCalled();
      expect(result).toHaveLength(1);
      expect(result[0]).toBeInstanceOf(PostResponseDto);
      expect(result[0].id).toBe(mockPost.id);
    });

    it('should return an empty array when no posts exist', async () => {
      mockService.findAll.mockResolvedValue([]);

      const result = await facade.getAllPosts();

      expect(mockService.findAll).toHaveBeenCalled();
      expect(result).toEqual([]);
    });
  });

  describe('createPost', () => {
    it('should return a PostResponseDto after creation', async () => {
      const dto: CreatePostRequestDto = {
        title: 'New Post',
        content: 'New Content',
      };
      mockService.create.mockResolvedValue(mockPost);

      const result = await facade.createPost(dto);

      expect(mockService.create).toHaveBeenCalledWith(dto);
      expect(result).toBeInstanceOf(PostResponseDto);
      expect(result.id).toBe(mockPost.id);
    });
  });
});
