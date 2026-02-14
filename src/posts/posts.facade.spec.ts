import { Test, TestingModule } from '@nestjs/testing';
import { PostsFacade } from './posts.facade';
import { PostsService } from './service/posts.service';
import { PostsValidationService } from './service/posts-validation.service';
import { PostResponseDto } from './dto/response/post.response.dto';
import { Post } from './entities/post.entity';
import { CreatePostRequestDto } from './dto/request/create-post.request.dto';

describe('PostsFacade', () => {
  let facade: PostsFacade;
  let mockService: jest.Mocked<PostsService>;
  let mockValidationService: jest.Mocked<PostsValidationService>;

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
      update: jest.fn(),
      delete: jest.fn(),
    } as unknown as jest.Mocked<PostsService>;

    mockValidationService = {
      validatePostExists: jest.fn(),
    } as unknown as jest.Mocked<PostsValidationService>;

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PostsFacade,
        { provide: PostsService, useValue: mockService },
        { provide: PostsValidationService, useValue: mockValidationService },
      ],
    }).compile();

    facade = module.get<PostsFacade>(PostsFacade);
  });

  describe('getPostById', () => {
    it('should return a PostResponseDto when post exists', async () => {
      mockValidationService.validatePostExists.mockResolvedValue(mockPost);

      const result = await facade.getPostById(1);

      expect(mockValidationService.validatePostExists).toHaveBeenCalledWith(1);
      expect(result).toBeInstanceOf(PostResponseDto);
      expect(result.id).toBe(mockPost.id);
      expect(result.title).toBe(mockPost.title);
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

  describe('updatePost', () => {
    it('should return PostResponseDto when post exists', async () => {
      const dto = { title: 'Updated Title' };
      const updatedPost: Post = { ...mockPost, title: 'Updated Title' };
      mockValidationService.validatePostExists.mockResolvedValue(mockPost);
      mockService.update.mockResolvedValue(updatedPost);

      const result = await facade.updatePost(1, dto);

      expect(mockValidationService.validatePostExists).toHaveBeenCalledWith(1);
      expect(mockService.update).toHaveBeenCalledWith(1, dto);
      expect(result).toBeInstanceOf(PostResponseDto);
      expect(result.id).toBe(mockPost.id);
      expect(result.title).toBe('Updated Title');
    });
  });

  describe('deletePost', () => {
    it('should call delete when post exists', async () => {
      mockValidationService.validatePostExists.mockResolvedValue(mockPost);
      mockService.delete.mockResolvedValue(undefined);

      await facade.deletePost(1);

      expect(mockValidationService.validatePostExists).toHaveBeenCalledWith(1);
      expect(mockService.delete).toHaveBeenCalledWith(1);
    });
  });
});
