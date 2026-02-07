import { Test, TestingModule } from '@nestjs/testing';
import { PostsService } from './posts.service';
import { IPostRepository } from './post-repository.interface';
import { Post } from './entities/post.entity';
import { CreatePostRequestDto } from './dto/request/create-post.request.dto';

describe('PostsService', () => {
  let service: PostsService;
  let mockRepository: jest.Mocked<IPostRepository>;

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
    mockRepository = {
      findById: jest.fn(),
      findAll: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
    } as jest.Mocked<IPostRepository>;

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PostsService,
        { provide: IPostRepository, useValue: mockRepository },
      ],
    }).compile();

    service = module.get<PostsService>(PostsService);
  });

  describe('findById', () => {
    it('should call repository.findById and return a post', async () => {
      mockRepository.findById.mockResolvedValue(mockPost);

      const result = await service.findById(1);

      expect(mockRepository.findById).toHaveBeenCalledWith(1);
      expect(result).toEqual(mockPost);
    });

    it('should return null when post not found', async () => {
      mockRepository.findById.mockResolvedValue(null);

      const result = await service.findById(999);

      expect(mockRepository.findById).toHaveBeenCalledWith(999);
      expect(result).toBeNull();
    });
  });

  describe('findAll', () => {
    it('should call repository.findAll and return posts', async () => {
      const posts = [mockPost];
      mockRepository.findAll.mockResolvedValue(posts);

      const result = await service.findAll();

      expect(mockRepository.findAll).toHaveBeenCalled();
      expect(result).toEqual(posts);
    });

    it('should return an empty array when no posts exist', async () => {
      mockRepository.findAll.mockResolvedValue([]);

      const result = await service.findAll();

      expect(mockRepository.findAll).toHaveBeenCalled();
      expect(result).toEqual([]);
    });
  });

  describe('create', () => {
    it('should call repository.create and return the created post', async () => {
      const dto: CreatePostRequestDto = {
        title: 'New Post',
        content: 'New Content',
      };
      mockRepository.create.mockResolvedValue(mockPost);

      const result = await service.create(dto);

      expect(mockRepository.create).toHaveBeenCalledWith(dto);
      expect(result).toEqual(mockPost);
    });
  });
});
